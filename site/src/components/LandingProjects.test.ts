import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/projects';
import { projectsErrorMessage } from './LandingProjects';

describe('projectsErrorMessage', () => {
  it('names a network failure', () => {
    expect(projectsErrorMessage(new ApiError(0, 'network_error'))).toContain('Could not reach the server');
  });

  it('uses the generic copy for any other failure', () => {
    expect(projectsErrorMessage(new ApiError(500, 'request_failed'))).toBe(
      'Could not load projects. Please try again.',
    );
  });
});
