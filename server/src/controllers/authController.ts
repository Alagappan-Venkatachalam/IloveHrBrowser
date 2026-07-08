import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import prisma from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'ilovexams_super_secret_jwt_key_2026';

// Initialize session and generate OTP
export const createSession = async (req: Request, res: Response) => {
  try {
    const { recruiterEmail, recruiterName, studentMobile, studentName } = req.body;

    if (!recruiterEmail || !studentMobile || !studentName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 1. Find or create recruiter
    let recruiter = await prisma.recruiter.findUnique({
      where: { email: recruiterEmail },
    });
    if (!recruiter) {
      recruiter = await prisma.recruiter.create({
        data: {
          email: recruiterEmail,
          name: recruiterName || 'Recruiter',
        },
      });
    }

    // 2. Generate a secure hashcode string for the connection URL
    const hash = crypto.randomBytes(16).toString('hex');

    // 3. Generate a 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // 4. Set expiration (15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // 5. Save OTP verification
    await prisma.otpVerification.create({
      data: {
        mobileNumber: studentMobile,
        hash,
        code: hashedOtp,
        expiresAt,
      },
    });

    // 6. Create Pending Interview Session
    const session = await prisma.interviewSession.create({
      data: {
        recruiterId: recruiter.id,
        studentMobile,
        studentName,
        status: 'PENDING',
        activeMode: 'CODING',
      },
    });

    // 7. Dispatch SMS via textbee.dev gateway (if environment is configured)
    const textbeeApiKey = process.env.TEXTBEE_API_KEY;
    const textbeeDeviceId = process.env.TEXTBEE_DEVICE_ID;
    let smsSent = false;
    let smsError = null;

    if (textbeeApiKey && textbeeDeviceId) {
      try {
        const textbeeUrl = `https://api.textbee.dev/api/v1/gateway/devices/${textbeeDeviceId}/send-sms`;
        const message = `ilovexams.com - Hello ${studentName}, your OTP for your technical interview is: ${otp}. Direct link hash: ${hash}`;
        
        await axios.post(
          textbeeUrl,
          {
            recipients: [studentMobile],
            message: message,
          },
          {
            headers: {
              'x-api-key': textbeeApiKey,
              'Content-Type': 'application/json',
            },
          }
        );
        smsSent = true;
      } catch (err: any) {
        console.error('Failed to send SMS via textbee.dev:', err.message);
        smsError = err.message;
      }
    } else {
      console.log('\n--- LOCAL DEV OTP TELEMETRY ---');
      console.log(`Student Mobile: ${studentMobile}`);
      console.log(`Generated OTP: ${otp}`);
      console.log(`Hash Link: ${hash}`);
      console.log('-------------------------------\n');
    }

    return res.status(200).json({
      message: 'Session initiated successfully',
      sessionId: session.id,
      hash,
      otpCode: otp, // Returned for dev purposes
      smsSent,
      smsError: smsError ? 'SMS delivery skipped/failed' : null,
    });
  } catch (error: any) {
    console.error('Session initiation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Validate OTP & Student joining
export const verifyStudentOtp = async (req: Request, res: Response) => {
  try {
    const { hash, otp } = req.body;

    if (!hash || !otp) {
      return res.status(400).json({ error: 'Missing hash or OTP code' });
    }

    // 1. Look up OTP verification details
    const verification = await prisma.otpVerification.findUnique({
      where: { hash },
    });

    if (!verification) {
      return res.status(404).json({ error: 'Invalid verification link' });
    }

    if (verification.verified) {
      return res.status(400).json({ error: 'OTP has already been used' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // 2. Validate OTP value
    const isValid = await bcrypt.compare(otp, verification.code);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    // 3. Update verification state
    await prisma.otpVerification.update({
      where: { hash },
      data: { verified: true },
    });

    // 4. Find the matching interview session
    const session = await prisma.interviewSession.findFirst({
      where: {
        studentMobile: verification.mobileNumber,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return res.status(404).json({ error: 'No pending session found for this student' });
    }

    // Activate the session
    const updatedSession = await prisma.interviewSession.update({
      where: { id: session.id },
      data: { status: 'ACTIVE' },
    });

    // 5. Issue JWT access token
    const token = jwt.sign(
      {
        sessionId: updatedSession.id,
        role: 'STUDENT',
        name: updatedSession.studentName,
        mobileNumber: updatedSession.studentMobile,
      },
      JWT_SECRET,
      { expiresIn: '3h' }
    );

    return res.status(200).json({
      message: 'OTP verified, session active',
      token,
      sessionId: updatedSession.id,
      role: 'STUDENT',
      studentName: updatedSession.studentName,
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate Recruiter token for session access
export const verifyRecruiterSession = async (req: Request, res: Response) => {
  try {
    const { sessionId, email } = req.body;

    if (!sessionId || !email) {
      return res.status(400).json({ error: 'Session ID and Email required' });
    }

    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { recruiter: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.recruiter.email !== email) {
      return res.status(403).json({ error: 'Unauthorized access to this session' });
    }

    const token = jwt.sign(
      {
        sessionId: session.id,
        role: 'RECRUITER',
        name: session.recruiter.name,
        email: session.recruiter.email,
      },
      JWT_SECRET,
      { expiresIn: '3h' }
    );

    return res.status(200).json({
      token,
      sessionId: session.id,
      role: 'RECRUITER',
      recruiterName: session.recruiter.name,
    });
  } catch (error) {
    console.error('Recruiter validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
