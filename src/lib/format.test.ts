import { describe, it, expect } from 'vitest';
import { formatDuration, parseDuration } from './format.js';

describe('parseDuration', () => {
  it('parses h:m form', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('0:15')).toBe(15);
    expect(parseDuration('10:00')).toBe(600);
  });

  it('parses bare numbers as minutes', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('1')).toBe(1);
  });

  it('parses fractional minutes by rounding', () => {
    expect(parseDuration('1.4')).toBe(1);
    expect(parseDuration('1.5')).toBe(2);
    expect(parseDuration('59.6')).toBe(60);
  });

  it('parses hour suffix', () => {
    expect(parseDuration('1h')).toBe(60);
    expect(parseDuration('2h')).toBe(120);
    expect(parseDuration('1.5h')).toBe(90);
  });

  it('parses minute suffix', () => {
    expect(parseDuration('45m')).toBe(45);
    expect(parseDuration('30m')).toBe(30);
  });

  it('parses composite hour+minute', () => {
    expect(parseDuration('1h30m')).toBe(90);
    expect(parseDuration('2h15m')).toBe(135);
    expect(parseDuration('1h 30m')).toBe(90);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseDuration('1H30M')).toBe(90);
    expect(parseDuration('  1h30m  ')).toBe(90);
  });

  it('rejects empty and unparseable input', () => {
    expect(() => parseDuration('')).toThrow(/empty/i);
    expect(() => parseDuration('   ')).toThrow(/empty/i);
    expect(() => parseDuration('abc')).toThrow(/Could not parse/);
    expect(() => parseDuration('1d')).toThrow(/Could not parse/);
  });
});

describe('formatDuration', () => {
  it('formats minute-only durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(15)).toBe('15m');
    expect(formatDuration(59)).toBe('59m');
  });

  it('formats hour+minute durations', () => {
    expect(formatDuration(60)).toBe('1h 0m');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(135)).toBe('2h 15m');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-5)).toBe('0m');
  });
});
