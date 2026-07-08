import { Request, Response } from 'express';

interface MCQMockItem {
  question: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
}

// Preset database of relevant MCQs for dynamic query mapping
const PRESET_MCQS: Record<string, MCQMockItem[]> = {
  react: [
    {
      question: 'Which hook should be used to memoize the result of an expensive computation in React?',
      choices: ['useCallback', 'useMemo', 'useEffect', 'useRef'],
      correctAnswerIndex: 1,
      explanation: 'useMemo returns a memoized value, recomputing it only when dependencies change. useCallback memoizes the callback function itself.',
    },
    {
      question: 'What is the purpose of the dependency array in a useEffect hook?',
      choices: [
        'To list state variables that trigger effect cleanup only',
        'To define which properties are reactive and trigger re-renders',
        'To control when the effect function is executed based on change detection',
        'To optimize DOM node references during updates',
      ],
      correctAnswerIndex: 2,
      explanation: 'Next.js/React compares values in the dependency array on every render. The effect runs if and only if one of these values has changed.',
    },
  ],
  docker: [
    {
      question: 'What is the primary difference between a Docker Image and a Docker Container?',
      choices: [
        'An image is a writeable instance, whereas a container is read-only.',
        'An image is a read-only template containing instructions, whereas a container is a runnable instance.',
        'Containers run on virtualized kernels, while images run directly on the host OS.',
        'Images are created using Docker Compose, while containers are built from Dockerfiles.',
      ],
      correctAnswerIndex: 1,
      explanation: 'A Docker image is a read-only snapshot containing the OS, libraries, and code. A container is a running, writeable instance of that image.',
    },
  ],
  database: [
    {
      question: 'Under ACID compliance, which property ensures database transactions do not yield intermediate states?',
      choices: ['Atomicity', 'Consistency', 'Isolation', 'Durability'],
      correctAnswerIndex: 0,
      explanation: 'Atomicity requires that each transaction is treated as a single "unit" which either succeeds completely or fails completely (all-or-nothing).',
    },
    {
      question: 'What is the difference between a clustered and a non-clustered index?',
      choices: [
        'Clustered index stores data rows in the index, non-clustered stores pointers to data.',
        'A table can have multiple clustered indexes, but only one non-clustered index.',
        'Clustered indexes are slower for range queries.',
        'Non-clustered indexes are stored in-memory, clustered on disk.',
      ],
      correctAnswerIndex: 0,
      explanation: 'A clustered index determines the physical order of data in the table, so only one can exist. Non-clustered indexes store pointers to the physical data pages.',
    },
  ],
  redis: [
    {
      question: 'Which cache eviction policy in Redis drops the least recently used keys, but only among keys with an expire set?',
      choices: ['allkeys-lru', 'volatile-lru', 'volatile-ttl', 'noeviction'],
      correctAnswerIndex: 1,
      explanation: 'volatile-lru evicts the least recently used keys among those that have an expiration set, preserving keys with no expiration.',
    },
  ],
  system_design: [
    {
      question: 'When designing a highly available chat application, which transport protocol minimizes packet payload and handshake latency?',
      choices: ['HTTP Short Polling', 'WebSockets', 'gRPC HTTP/2', 'SMTP Mail Relay'],
      correctAnswerIndex: 1,
      explanation: 'WebSockets establish a persistent, bidirectional TCP connection which eliminates HTTP header overhead on recurrent transmissions.',
    },
  ],
};

export const searchMockMcqs = (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cleanQuery = query.toLowerCase().trim();
    let results: MCQMockItem[] = [];

    // Check presets first
    for (const key of Object.keys(PRESET_MCQS)) {
      if (cleanQuery.includes(key) || key.includes(cleanQuery)) {
        results = [...results, ...PRESET_MCQS[key]];
      }
    }

    // Default mock generator if no presets matched
    if (results.length === 0) {
      results = [
        {
          question: `Which of the following is a core operational consideration when working with '${query}'?`,
          choices: [
            `Ensuring vertical scaling limits are monitored under peak load`,
            `Utilizing distributed key hashing to balance write traffic`,
            `Managing stateful session replication across edge environments`,
            `All of the above`,
          ],
          correctAnswerIndex: 3,
          explanation: `When deploying services built with ${query}, scale targets, load distribution, and session architectures are crucial elements.`,
        },
        {
          question: `In a microservices architecture, what is a primary challenge when deploying '${query}'?`,
          choices: [
            'Distributed tracing and debugging visibility',
            'Cross-service communication overhead and latency',
            'Data consistency across boundary contexts',
            'All of the above',
          ],
          correctAnswerIndex: 3,
          explanation: `Microservices leveraging ${query} face complexities in tracing calls, network roundtrips, and maintaining transactional consistency.`,
        },
      ];
    }

    // Simulate search latency of 300ms
    setTimeout(() => {
      return res.status(200).json({ query, questions: results });
    }, 300);
  } catch (error) {
    console.error('Smart search error:', error);
    return res.status(500).json({ error: 'Failed to process search query' });
  }
};
