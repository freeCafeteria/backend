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

//redis에서 급식소 정보 들고오기
redisClient.get("cafeterias", (err, value) => {
  const value2 = JSON.parse(value);
  console.log(value2);
});

// 공공데이터 불러와서 redis에 저장
const set_data_in_redis = async () => {
  const baseURL = process.env.BASEURL;
  const encoding_key = process.env.API_KEY;

  try {
    const res = await axios.get(
      `${baseURL}?serviceKey=${encoding_key}&pageNo=1&numOfRows=100&type=json`
    );
    // console.log("data_array: ", res.data.response.body.items);
    // console.log("data: ", res.data.response);
    if (res.data.response) {
      //redis에 공공데이터 저장
      redisClient.set(
        "cafeterias",
        JSON.stringify(res.data.response.body.items)
      );
    }
  } catch (error) {
    console.log(error);
  }
};

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(3000, () => {
  //서버 실행 시 공공 데이터 가져오기
  set_data_in_redis();

  //스케줄러 등록
  schedule.scheduleJob("0 0 0 * * *", () => {
    const koreaTime = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Seoul",
    });
    console.log(koreaTime);
    set_data_in_redis(); // 자정마다 데이터 저장
  });
});
