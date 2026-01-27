export const metadata = {
  title: "Wancko",
  description: "Natural assistant aligned with AU"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui" }}>
        {children}
      </body>
    </html>
  );
}
