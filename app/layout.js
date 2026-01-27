export const metadata = {
  title: "Wancko",
  description: "Natural assistant aligned with AU"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0e0e0e", color: "#eaeaea" }}>
        {children}
      </body>
    </html>
  );
}
