import { SetMetadata } from '@nestjs/common';

export const PRIVATE_RESPONSE_KEY = 'privateResponse';

/** Keep public session exchanges private even though they bypass JWT auth. */
export const PrivateResponse = () => SetMetadata(PRIVATE_RESPONSE_KEY, true);
