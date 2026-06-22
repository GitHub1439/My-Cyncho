const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken
    })
    : null;

const ratelimit = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '1 m'),
        analytics: true,
        prefix: 'cyncho:send-inquiry'
    })
    : null;

module.exports = {
    ratelimit
};
