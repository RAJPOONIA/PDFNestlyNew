import type { Metadata } from 'next';
import { AuthFormView } from '@/components/AuthFormView';

export const metadata: Metadata = {
  title: 'Sign In to Your Account',
  description:
    'Sign in to PDFNestly with Google or Email & Password to view your PDF processing history and manage account settings.',
  alternates: {
    canonical: '/login',
  },
};

export default function LoginPage() {
  return <AuthFormView initialMode="login" />;
}
