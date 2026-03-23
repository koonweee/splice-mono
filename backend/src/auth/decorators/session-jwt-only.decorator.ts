import { SetMetadata } from '@nestjs/common';

export const SESSION_JWT_ONLY_KEY = 'sessionJwtOnly';
export const SessionJwtOnly = () => SetMetadata(SESSION_JWT_ONLY_KEY, true);
