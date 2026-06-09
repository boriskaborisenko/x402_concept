import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { configRoutes } from './routes/configRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'x402easy-backend' });
});

app.use('/api', configRoutes);
app.use('/api', paymentRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(port, () => {
  console.log(`x402Easy backend running on http://localhost:${port}`);
});
