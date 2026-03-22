import app from "./app";

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), () => {
  console.log(`Olarion API running on http://localhost:${PORT}`);
});
