export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="p-4 font-sans">
          <h1 className="text-xl">Compliance Rota — Manager Console</h1>
          {children}
        </div>
      </body>
    </html>
  );
}

