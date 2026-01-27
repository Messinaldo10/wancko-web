export const metadata = {
  title: "Wancko",
  description: "Natural assistant aligned with AU"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
     <body style={{
  margin: 0,
  backgroundColor: "#ffffff",
  color: "#111111",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  lineHeight: 1.6
}}>
  {children}
</body>
    </html>
  );
}
