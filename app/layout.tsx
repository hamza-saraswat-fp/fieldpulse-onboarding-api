export const metadata = {
  title: 'FieldPulse Onboarding API',
  description: 'Salesforce-facing API for the onboarding wizard.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
