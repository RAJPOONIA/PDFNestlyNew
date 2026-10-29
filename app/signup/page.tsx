import type { Metadata } from 'next';
import { AuthFormView } from '@/components/AuthFormView';

export const metadata: Metadata = {
  title: 'Create Your PDFNestly Account',
  description:
    'Create a free PDFNestly account to track your PDF processing history and manage document workflows.',
  alternates: {
    canonical: '/signup',
  },
};

export default function SignupPage() {
  return <AuthFormView initialMode="signup" />;
}
