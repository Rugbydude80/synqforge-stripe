import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest';
import { NextRequest } from 'next/server';
import { getErrorRedirect, getStatusRedirect } from '@/utils/helpers';

export async function GET(request: NextRequest) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the `@supabase/ssr` package. It exchanges an auth code for the user's session.
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        getErrorRedirect(
          `${requestUrl.origin}/signin`,
          error.name,
          "Sorry, we weren't able to log you in. Please try again."
        )
      );
    }

    // Emit signup completion for first-time users; we can't know here for sure, so emit safely with user info
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      await inngest.send({
        name: 'user.signup.completed',
        data: { userId: user.id, email: user.email }
      });
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(
    getStatusRedirect(
      `${requestUrl.origin}/account`,
      'Success!',
      'You are now signed in.'
    )
  );
}
