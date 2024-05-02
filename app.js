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

// 공공데이터 불러와서 redis에 저장
const set_data_in_redis = async () => {
  let data = [];
  let page = 1;
  while (true) {
    let newData = await get_cafeteria_data(page);
    data = [...data, ...newData];
    if (newData.length < 100) {
      //데이터를 한번에 100개씩 들고오는데 마지막페이지는 남은 급식소 개수를 들고오므로 100보다 작다.
      break;
    } else {
      page += 1;
    }
  }

  //redis에 공공데이터 저장
  let setting = await redisClient.v4.set("cafeterias", JSON.stringify(data));
  if (setting) {
    console.log("급식소 data저장 성공");
  } else {
    console.log("급식소 data저장 실패");
  }
};

//100개씩 공공데이터를 담는 로직
const get_cafeteria_data = async (pageNumber) => {
  const baseURL = process.env.BASEURL;
  const encoding_key = process.env.API_KEY;

  try {
    const res = await axios.get(
      `${baseURL}?serviceKey=${encoding_key}&pageNo=${pageNumber}&numOfRows=100&type=json`
    );

    return res.data.response.body.items;
  } catch (error) {
    console.log(error);
    return null;
  }
};

app.get("/allCafeterias", async (req, res) => {
  let data = await redisClient.v4.get("cafeterias");

  data = JSON.parse(data);
  console.log(data.length);
  res.status(200).json(data);
});

app.post("/filteredCafeterias", async (req, res) => {
  // user 위도,경도 가져오기
  const userLat = req.body.lat;
  const userLon = req.body.lon;
  console.log(userLat, userLon);

  // 급식소 정보 들고오기
  let data = await redisClient.v4.get("cafeterias");
  data = JSON.parse(data);
  //filter 로직
  const filteredData = data.filter((cafeteria) => {
    if (!cafeteria.latitude) {
      return false;
    }
    if (!cafeteria.longitude) {
      return false;
    }
    //위도 검사
    if (
      userLat - 0.5 <= Number(cafeteria.latitude) &&
      Number(cafeteria.latitude) <= userLat + 0.5
    ) {
      return true;
    }
    //경도 검사
    if (
      userLon - 0.5 <= Number(cafeteria.longitude) &&
      Number(cafeteria.longitude) <= userLon + 0.5
    ) {
      return true;
    }
  });
  console.log(filteredData.length);
  res.status(200).json(filteredData);
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
