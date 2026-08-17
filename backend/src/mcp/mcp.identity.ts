import type { UserService } from '../user/user.service';

const AUTH0_GOOGLE_SUBJECT_PREFIX = 'google-oauth2|';

function isValidGoogleSubject(subject: string): boolean {
  return (
    subject.length > 0 &&
    subject.length <= 255 &&
    !/[\s|]/u.test(subject) &&
    ![...subject].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  );
}

export function googleSubjectFromAuth0Subject(subject: string): string {
  if (!subject.startsWith(AUTH0_GOOGLE_SUBJECT_PREFIX)) {
    throw new Error('Unsupported MCP identity provider.');
  }

  const googleSubject = subject.slice(AUTH0_GOOGLE_SUBJECT_PREFIX.length);
  if (!isValidGoogleSubject(googleSubject)) {
    throw new Error('Malformed MCP identity subject.');
  }
  return googleSubject;
}

export async function resolveSpliceMcpUserId(
  auth0Subject: string,
  userService: Pick<UserService, 'findByGoogleSubject'>,
): Promise<string> {
  const googleSubject = googleSubjectFromAuth0Subject(auth0Subject);
  const user = await userService.findByGoogleSubject(googleSubject);
  if (!user) {
    throw new Error('MCP identity is not linked to a Splice user.');
  }
  return user.id;
}
