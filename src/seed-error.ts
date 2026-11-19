import { message } from './messages.js';
import { BoardVerificationError } from './verify-boards.js';

export type SeedStage = 'setup' | 'verification' | 'connect' | 'indexes' | 'upserts';

export function formatSeedError(error: unknown, stage: SeedStage) {
  if (error instanceof BoardVerificationError) {
    return message('seedDiagnostic', { stage, reason: error.message });
  }
  const details = error !== null && typeof error === 'object'
    ? error as { name?: unknown; code?: unknown; message?: unknown }
    : {};
  // Use known categories only: raw driver messages can include credentials.
  let reason = message('seedFailed');
  if (details.message === message('mongodbUriRequired')) reason = message('mongodbUriRequired');
  else if (details.message === message('invalidDnsServers')) reason = message('invalidDnsServers');
  else if (details.code === 18) reason = message('authenticationFailed');
  else if (details.code === 13) reason = message('authorizationFailed');
  else if (details.code === 11000) reason = message('uniqueConflict');
  else if (details.code === 'EBADRESP' || details.code === 'ESERVFAIL'
    || details.code === 'ETIMEOUT' || details.code === 'ENODATA') reason = message('dnsFailed');
  else if (details.code === 'ENOTFOUND' || details.code === 'ECONNREFUSED'
    || details.name === 'MongooseServerSelectionError' || details.name === 'MongoServerSelectionError') {
    reason = message('connectionFailed');
  } else if (details.name === 'MongoParseError' || details.name === 'MongoInvalidArgumentError') {
    reason = message('invalidMongoUri');
  } else if (details.name === 'SyntaxError') reason = message('invalidJson');
  else if (details.name === 'ZodError' || details.name === 'ValidationError') reason = message('validationFailed');
  return message('seedDiagnostic', { stage, reason });
}
