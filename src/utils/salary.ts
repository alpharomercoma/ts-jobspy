import { Compensation, CompensationInterval } from '../types';

export function parseSalary(salaryText: string): Compensation | undefined {
  if (!salaryText) return undefined;

  const cleanText = salaryText.replace(/[,\s]/g, '').toLowerCase();

  // Extract numbers
  const numbers = cleanText.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return undefined;

  // Determine currency
  let currency = 'USD';
  if (cleanText.includes('£') || cleanText.includes('gbp')) currency = 'GBP';
  else if (cleanText.includes('€') || cleanText.includes('eur')) currency = 'EUR';
  else if (cleanText.includes('₹') || cleanText.includes('inr')) currency = 'INR';
  else if (cleanText.includes('৳') || cleanText.includes('bdt')) currency = 'BDT';

  // Determine interval
  let interval: CompensationInterval = CompensationInterval.YEARLY;
  if (cleanText.includes('hour') || cleanText.includes('/hr')) interval = CompensationInterval.HOURLY;
  else if (cleanText.includes('day') || cleanText.includes('/day')) interval = CompensationInterval.DAILY;
  else if (cleanText.includes('week') || cleanText.includes('/week')) interval = CompensationInterval.WEEKLY;
  else if (cleanText.includes('month') || cleanText.includes('/month')) interval = CompensationInterval.MONTHLY;

  const amounts = numbers.map(n => parseFloat(n));

  if (amounts.length === 1) {
    return {
      minAmount: amounts[0],
      maxAmount: amounts[0],
      currency,
      interval
    };
  } else if (amounts.length >= 2) {
    return {
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      currency,
      interval
    };
  }

  return undefined;
}

export function normalizeSalaryToAnnual(compensation: Compensation): Compensation {
  if (!compensation || compensation.interval === CompensationInterval.YEARLY) return compensation;

  const multipliers: Record<CompensationInterval, number> = {
    [CompensationInterval.HOURLY]: 2080, // 40 hours/week * 52 weeks
    [CompensationInterval.DAILY]: 260,   // 5 days/week * 52 weeks
    [CompensationInterval.WEEKLY]: 52,
    [CompensationInterval.MONTHLY]: 12,
    [CompensationInterval.YEARLY]: 1
  };

  const multiplier = compensation.interval ? multipliers[compensation.interval] : 1;

  return {
    ...compensation,
    minAmount: (compensation.minAmount || 0) * multiplier,
    maxAmount: (compensation.maxAmount || 0) * multiplier,
    interval: CompensationInterval.YEARLY
  };
}
