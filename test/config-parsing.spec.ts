import { describe, expect, it } from 'vitest';
import { parseReplayFeedConfig } from '../src/feed';

const VALID_PARAMS = {
	source: 'https://source.example.com/feed.xml',
	startDate: '2026-05-05',
};

describe('parseReplayFeedConfig input validation', () => {
	describe('startDate semantic validation', () => {
		it('rejects a start date with month 00', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2024-00-15' })).toThrow(
				/startDate/,
			);
		});

		it('rejects a start date with month 13', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2024-13-15' })).toThrow(
				/startDate/,
			);
		});

		it('rejects a start date with day 00', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2024-01-00' })).toThrow(
				/startDate/,
			);
		});

		it('rejects a start date that overflows the month (Feb 30)', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2024-02-30' })).toThrow(
				/startDate/,
			);
		});

		it('accepts Feb 29 in a leap year', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2024-02-29' })).not.toThrow();
		});

		it('rejects Feb 29 in a non-leap year', () => {
			expect(() => parseReplayFeedConfig({ ...VALID_PARAMS, startDate: '2023-02-29' })).toThrow(
				/startDate/,
			);
		});
	});

	describe('cadenceCount integer validation', () => {
		it('rejects a cadenceCount with trailing non-numeric characters', () => {
			expect(() =>
				parseReplayFeedConfig({ ...VALID_PARAMS, cadenceCount: '2abc' }),
			).toThrow(/cadenceCount/);
		});

		it('rejects a non-integer cadenceCount', () => {
			expect(() =>
				parseReplayFeedConfig({ ...VALID_PARAMS, cadenceCount: '1.5' }),
			).toThrow(/cadenceCount/);
		});

		it('accepts a plain positive integer cadenceCount', () => {
			expect(() =>
				parseReplayFeedConfig({ ...VALID_PARAMS, cadenceCount: '7' }),
			).not.toThrow();
		});
	});
});
