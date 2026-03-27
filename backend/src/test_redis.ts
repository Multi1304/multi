
import Redis from 'ioredis';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
});

redis.on('connect', () => {
  console.log('Successfully connected to Redis at 127.0.0.1:6379');
  process.exit(0);
});

redis.on('error', (err) => {
  console.error('Failed to connect to Redis:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Connection timed out');
  process.exit(1);
}, 5000);
