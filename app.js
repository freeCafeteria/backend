import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import schedule from "node-schedule";
import redis from "redis";

dotenv.config();
const app = express();
app.use(express.json());

//redis 연결
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/0`,
  legacyMode: true,
});

redisClient.on("connect", () => {
  console.log("Redis connected!");
});
redisClient.on("error", (err) => {
  console.error("Redis Client Error", err);
});
redisClient.connect().then(); // redis v4 연결 (비동기)
const redisCli = redisClient.v4;

// 공공데이터 불러오기
const get_data = async () => {
  const baseURL = process.env.BASEURL;
  const encoding_key = process.env.API_KEY;

  try {
    const res = await axios.get(
      `${baseURL}?serviceKey=${encoding_key}&pageNo=1&numOfRows=100&type=json`
    );
    // console.log('data_array: ', res.data.response.body.items);
    console.log("data: ", res.data.response);
  } catch (error) {
    console.log(error);
  }
};

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(3000, () => {
  //서버 실행 시 공공 데이터 가져오기
  get_data();

  //스케줄러 등록
  schedule.scheduleJob("0 0 0 * * *", () => {
    const koreaTime = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Seoul",
    });
    console.log(koreaTime);
  });
});
