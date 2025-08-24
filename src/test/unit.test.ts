import { JobDataFrame } from '../models';

describe('Unit Tests', () => {

  describe('JobDataFrame', () => {
    const mockJobs = [
      {
        id: '1',
        title: 'Software Engineer',
        companyName: 'Tech Corp',
        jobUrl: 'https://example.com/job1',
        location: { city: 'San Francisco', state: 'CA' },
        datePosted: '2024-01-01',
        isRemote: false,
      },
      {
        id: '2',
        title: 'Frontend Developer',
        companyName: 'Web Inc',
        jobUrl: 'https://example.com/job2',
        location: { city: 'New York', state: 'NY' },
        datePosted: '2024-01-02',
        isRemote: true,
      },
    ];

    let dataFrame: JobDataFrame;

    beforeEach(() => {
      dataFrame = new JobDataFrame(mockJobs as any);
    });

    test('should return correct length', () => {
      expect(dataFrame.length).toBe(2);
    });

    test('should return head correctly', () => {
      expect(dataFrame.head(1)).toHaveLength(1);
      expect(dataFrame.head(5)).toHaveLength(2); // Should not exceed available
      expect(dataFrame.head()).toHaveLength(2); // Default should return all
    });

    test('should return tail correctly', () => {
      expect(dataFrame.tail(1)).toHaveLength(1);
      expect(dataFrame.tail(1)[0].title).toBe('Frontend Developer');
    });

    test('should filter correctly', () => {
      const remote = dataFrame.filter(job => job.isRemote === true);
      expect(remote.length).toBe(1);
      expect(remote.head(1)[0].title).toBe('Frontend Developer');
    });

    test('should group by correctly', () => {
      const grouped = dataFrame.groupBy('isRemote');
      expect(grouped).toHaveProperty('true');
      expect(grouped).toHaveProperty('false');
      expect(grouped.true).toHaveLength(1);
      expect(grouped.false).toHaveLength(1);
    });

    test('should handle empty data frame', () => {
      const empty = new JobDataFrame([]);
      expect(empty.length).toBe(0);
      expect(empty.head()).toHaveLength(0);
      expect(empty.tail()).toHaveLength(0);
      expect(() => empty.filter(job => true)).not.toThrow();
    });
  });
});
