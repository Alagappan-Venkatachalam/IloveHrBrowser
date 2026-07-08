import { Request, Response } from 'express';

interface WebSearchQuestion {
  title: string;
  source: string;
  description: string;
  templateCode: string;
  requirementsText: string;
}

const SEARCH_INDEX: Record<string, WebSearchQuestion[]> = {
  string: [
    {
      title: 'LeetCode 344. Reverse String (In-Place)',
      source: 'https://leetcode.com/problems/reverse-string/',
      description: 'Write a function that reverses a string. The input string is given as an array of characters. You must modify the input array in-place with O(1) extra memory.',
      templateCode: `// Language: JavaScript\n\nfunction reverseString(s) {\n  let left = 0;\n  let right = s.length - 1;\n  while (left < right) {\n    let temp = s[left];\n    s[left] = s[right];\n    s[right] = temp;\n    left++;\n    right--;\n  }\n  console.log("Reversed: ", s);\n}`,
      requirementsText: '* Input: s = ["h","e","l","l","o"]\n* Output: ["o","l","l","e","h"]\n* Time Complexity: O(N)\n* Space Complexity: O(1) in-place'
    }
  ],
  sum: [
    {
      title: 'LeetCode 1. Two Sum (HashMap Optimization)',
      source: 'https://leetcode.com/problems/two-sum/',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution.',
      templateCode: `// Language: JavaScript\n\nfunction twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}`,
      requirementsText: '* Input: nums = [2,7,11,15], target = 9\n* Output: [0,1]\n* Time Complexity: O(N)\n* Space Complexity: O(N)'
    }
  ],
  search: [
    {
      title: 'LeetCode 704. Binary Search',
      source: 'https://leetcode.com/problems/binary-search/',
      description: 'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.',
      templateCode: `// Language: JavaScript\n\nfunction search(nums, target) {\n  let left = 0;\n  let right = nums.length - 1;\n  while (left <= right) {\n    let mid = Math.floor((left + right) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}`,
      requirementsText: '* Input: nums = [-1,0,3,5,9,12], target = 9\n* Output: 4\n* Time Complexity: O(log N)\n* Space Complexity: O(1)'
    }
  ],
  uber: [
    {
      title: 'System Design: Uber Rider-Driver Matching Engine',
      source: 'https://systemdesignprimer.org/uber-matching/',
      description: 'Design a real-time matching system that pairs passengers with drivers. The passenger chooses a pickup location and a destination, and matches with nearby active drivers under 5 seconds.',
      templateCode: `// System Architecture Template\n// client -> api gateway\n// api gateway -> matching service\n// matching service -> redis geo-cache\n// matching service -> notification queue`,
      requirementsText: '* Scale: 10M active daily requests\n* Latency: Match duration under 5s\n* Data Storage: Geohash indexing via Redis'
    }
  ],
};

export const searchWebQuery = (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cleanQuery = query.toLowerCase().trim();
    let results: WebSearchQuestion[] = [];

    // Match keywords
    for (const key of Object.keys(SEARCH_INDEX)) {
      if (cleanQuery.includes(key) || key.includes(cleanQuery)) {
        results = [...results, ...SEARCH_INDEX[key]];
      }
    }

    // Default return if no keywords match
    if (results.length === 0) {
      results = [
        {
          title: `Custom Search: ${query} (Interview Blueprint)`,
          source: 'https://github.com/donnemartin/system-design-primer',
          description: `Describe or implement the structural specifications for '${query}'. Design a scalable, highly available solution detailing operational bottlenecks.`,
          templateCode: `// Writable Code Template for ${query}\nfunction solveProblem() {\n  // Write solution\n}`,
          requirementsText: `* Functional: Build endpoints for ${query}\n* Non-Functional: Highly Available, fault tolerant\n* Test Case: Input validation checks`
        }
      ];
    }

    // Simulate crawl latency
    setTimeout(() => {
      return res.status(200).json({ query, results });
    }, 450);
  } catch (error) {
    console.error('Web search crawler error:', error);
    return res.status(500).json({ error: 'Failed to process web search crawler request' });
  }
};
