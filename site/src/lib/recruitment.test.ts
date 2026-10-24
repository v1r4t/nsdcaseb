/**
 * Unit tests for site/src/lib/recruitment.ts.
 *
 * Covers the pure client-side logic: phone normalisation, pre-submit
 * validation (required fields, college email domain, year eligibility,
 * answer length floors) and application-status copy.
 */
import { describe, expect, it } from 'vitest';
import {
  applicationStatusCopy,
  normalizePhone,
  validateApplication,
} from './recruitment';
import type { ApplicationInput } from './recruitment';

function application(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    name: 'Aarav Sharma',
    email: 'aarav@bl.students.amrita.edu',
    reg_number: 'BL.SC.U4CSE24001',
    phone: '+91 98765 43210',
    year: '2',
    branch: 'Computer Science',
    why_join: 'I want to build real projects with people who care about data and AI.',
    contribute: 'I can help with backend engineering, documentation and event logistics.',
    time_commitment: '4-6 hours a week',
    remarks: '',
    ...overrides,
  };
}

describe('normalizePhone', () => {
  it('strips spaces, plus signs, hyphens and brackets', () => {
    expect(normalizePhone('+91 (98765) 43210')).toBe('919876543210');
    expect(normalizePhone('98765-43210')).toBe('9876543210');
  });

  it('leaves an already-clean number alone', () => {
    expect(normalizePhone('9876543210')).toBe('9876543210');
  });
});

describe('validateApplication', () => {
  it('accepts a complete, eligible application', () => {
    expect(validateApplication(application())).toEqual({});
  });

  it('reports every missing required field', () => {
    const errors = validateApplication({
      name: '  ',
      email: '',
      reg_number: '',
      phone: '',
      year: '',
      branch: '',
      why_join: '',
      contribute: '',
      time_commitment: '',
      remarks: '',
    });

    expect(Object.keys(errors).sort()).toEqual([
      'branch',
      'contribute',
      'email',
      'name',
      'phone',
      'reg_number',
      'time_commitment',
      'why_join',
      'year',
    ]);
  });

  it('requires the college email domain', () => {
    expect(validateApplication(application({ email: 'aarav@gmail.com' })).email).toMatch(
      /bl\.students\.amrita\.edu/i,
    );
    expect(validateApplication(application({ email: 'aarav@students.amrita.edu' })).email).toBeDefined();
    expect(validateApplication(application({ email: 'aarav@bl.students.amrita.edu' })).email).toBeUndefined();
  });

  it('accepts the college domain case-insensitively', () => {
    expect(
      validateApplication(application({ email: 'Aarav@BL.Students.Amrita.edu' })).email,
    ).toBeUndefined();
  });

  it('requires 10 to 15 digits in the phone number', () => {
    expect(validateApplication(application({ phone: '12345' })).phone).toBeDefined();
    expect(validateApplication(application({ phone: '1234567890123456' })).phone).toBeDefined();
    expect(validateApplication(application({ phone: '9876543210' })).phone).toBeUndefined();
    expect(
      validateApplication(application({ phone: '+91 (98765) 43210' })).phone,
    ).toBeUndefined();
  });

  it('only allows 1st, 2nd and 3rd year students', () => {
    expect(validateApplication(application({ year: '1' })).year).toBeUndefined();
    expect(validateApplication(application({ year: '2' })).year).toBeUndefined();
    expect(validateApplication(application({ year: '3' })).year).toBeUndefined();
    expect(validateApplication(application({ year: '4' })).year).toBeDefined();
    expect(validateApplication(application({ year: 'alumni' })).year).toBeDefined();
  });

  it('sets answer length floors for why_join and contribute', () => {
    expect(validateApplication(application({ why_join: 'Because.' })).why_join).toBeDefined();
    expect(validateApplication(application({ contribute: 'Anything.' })).contribute).toBeDefined();
    expect(
      validateApplication(application({ why_join: '   ' + 'a'.repeat(40) + '   ' })).why_join,
    ).toBeUndefined();
  });

  it('never reports remarks, which are optional', () => {
    expect(Object.keys(validateApplication(application({ remarks: undefined })))).not.toContain(
      'remarks',
    );
  });
});

describe('applicationStatusCopy', () => {
  it('maps the three server statuses to human copy', () => {
    expect(applicationStatusCopy('pending').label).toBe('Under review');
    expect(applicationStatusCopy('selected').label).toBe('Selected');
    expect(applicationStatusCopy('rejected').label).toBe('Not selected');
  });

  it('explains each status honestly', () => {
    expect(applicationStatusCopy('pending').body).toMatch(/review/i);
    expect(applicationStatusCopy('selected').body).toMatch(/selected/i);
    expect(applicationStatusCopy('rejected').body).toMatch(/not selected/i);
  });
});
