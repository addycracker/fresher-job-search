import configuredProviders from '../config/providers.json' with { type: 'json' };
import { z } from 'zod';
import { message } from './messages.js';

export function validateProviders(input: unknown) {
  return z.record(
    z.string().regex(/^[a-z][a-z0-9_-]*$/),
    z.url().refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password
        && !url.search && !url.hash && value.endsWith('/');
    }, message('invalidBoardBaseUrl')),
  ).refine((value) => Object.keys(value).length > 0, message('providersRequired')).parse(input);
}

export const providerUrls = Object.freeze(validateProviders(configuredProviders));
export const providerNames = Object.keys(providerUrls);

export function isConfiguredProvider(value: string) {
  return Object.hasOwn(providerUrls, value);
}
