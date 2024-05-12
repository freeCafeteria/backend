import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import schedule from "node-schedule";
import redis from "redis";
import { isTimeInRange } from "./utils.js";
import { findNearestFacilities } from "./utils.js";

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

app.get("/allCafeteriasDate", async (req, res) => {
  let data = await redisClient.v4.get("cafeterias");

  data = JSON.parse(data);
  console.log(data.length);
  let date = [];
  for (let i = 0; i < data.length; i++) {
    date = [...date, data[i].mlsvDate];
  }
  res.status(200).send(date);
});

app.get("/allCafeteriasTime", async (req, res) => {
  let data = await redisClient.v4.get("cafeterias");

  data = JSON.parse(data);
  console.log(data.length);
  let date = [];
  for (let i = 0; i < data.length; i++) {
    date = [...date, data[i].mlsvTime];
  }
  res.status(200).send(date);
});

app.get("/allCafeteriasTarget", async (req, res) => {
  let data = await redisClient.v4.get("cafeterias");

  data = JSON.parse(data);
  console.log(data.length);
  let date = [];
  for (let i = 0; i < data.length; i++) {
    date = [...date, data[i].mlsvTrget];
  }
  res.status(200).send(date);
});

app.post("/filteredCafeterias", async (req, res) => {
  // user 위도,경도 가져오기

  const userDate = req.body.userDate; // user의 현재 요일
  const userTime = req.body.userTime; //user의 현재 시간
  const userTarget = req.body.userTarget.split(","); // user의 급식대상
  const userAge = req.body.userAge;
  console.log(userDate, userTime, userTarget, userAge);

  // 급식소 정보 들고오기
  let data = await redisClient.v4.get("cafeterias");
  data = JSON.parse(data);
  //filter 로직

  //요일 필터링
  console.log("요일 필터링");
  const dateFilteredData = data.filter((cafeteria) => {
    //요일 필터링
    let cafeteriaDate = cafeteria.mlsvDate;
    if (cafeteriaDate.includes("월~금")) {
      cafeteriaDate = cafeteriaDate.replace("월~금", "월,화,수,목,금");
    } else if (cafeteriaDate.includes("월~토")) {
      cafeteriaDate = cafeteriaDate.replace("월~토", "월,화,수,목,금,토");
    }
    if (cafeteriaDate.includes(userDate)) {
      // console.log(cafeteria.mlsvDate, userDate); //필터링된 요일
      return true;
    }
  });
  console.log(dateFilteredData.length);

  //시간 필터링
  console.log("시간 필터링");
  const timeFilteredData = dateFilteredData.filter((cafeteria) => {
    let cafeteriaTime = cafeteria.mlsvTime;
    const regex = /\b\d{1,2}:\d{2}\b/g;
    let times = [];
    const matches = cafeteriaTime.match(regex);
    if (matches) {
      times = times.concat(matches);
    }
    // console.log(times);
    // 시간이 2개 이상인 급식소만 필터링에 사용
    while (times.length >= 2) {
      // 시간을 2개씩 꺼내서 사용
      let startTime = times.shift();
      let endTime = times.shift();
      // console.log(startTime, endTime);
      if (isTimeInRange([startTime, endTime], userTime)) {
        // console.log(startTime, endTime);
        // console.log([userTime]);
        return true;
      }
    }
  });
  console.log(timeFilteredData.length);

  // 급식대상 필터링
  console.log("급식대상 필터링");
  const targetFilterData = timeFilteredData.filter((cafeteria) => {
    let cafeteriaTarget = cafeteria.mlsvTrget;
    let cafeteriaTargetList = cafeteriaTarget.split(/[ +]/);
    // console.log(cafeteriaTargetList);
    // cafeteriaTargetList => [ '65세이상', '저소득', '결식우려', '노인' ]

    for (let i = 0; i < cafeteriaTargetList.length; i++) {
      let element = cafeteriaTargetList[i];
      let age = undefined;
      let kidFlag = false;
      if (element === "결식아동") {
        //결식아동 예외처리
        age = 18;
        kidFlag = true;
      }
      //각 요소에 숫자가 포함되어 있는지 체크
      let ageList = [];
      [...element].forEach((e) => {
        if (Number(e) || Number(e) === 0) {
          ageList.push(e);
        }
      });
      if (ageList.length > 0 || kidFlag) {
        //요소에 숫자가 포함되어 있거나 결식아동인 경우
        // -> 나이와 필터링 해준다
        if (kidFlag) {
          if (Number(userAge) < age) {
            // 유저 나이가 기준 나이(결식아동) 보다 작다면
            return true;
          }
        } else {
          age = Number(ageList.join(""));
          if (Number(userAge) < age) {
            // 유저 나이가 기준 나이보다 작다면
            return false;
          }
        }
      } else {
        //요소에 나이가 포함되어 있지 않다면
        // ->유저가 준 키워드들 중 해당된다면 true를 반환한다
        for (let i = 0; i < userTarget.length; i++) {
          if (element.includes(userTarget[i])) {
            return true;
          }
        }
      }
    }
  });
  console.log(targetFilterData.length);
  res.status(200).json(targetFilterData);
});

// 유저 주변의 급식소 들고오기
app.post("/userAroundCafeterias", async (req, res) => {
  // user 위도,경도 가져오기

  const userLatitude = Number(req.body.userLatitude); // user 위도
  const userLongitude = Number(req.body.userLongitude); //user 경도
  console.log(userLatitude, userLongitude);
  const redisKey = `${userLatitude},${userLongitude}`;

  const redisKeyExist = await redisCli.exists(redisKey);
  let data;
  if (redisKeyExist) {
    console.log("key exist");
    data = await redisClient.v4.get(redisKey);
    data = JSON.parse(data);
  } else {
    console.log("key exist XXX");
    const allCafeterias = await redisClient.v4.get("cafeterias");
    data = JSON.parse(allCafeterias);
    data = findNearestFacilities(data, userLatitude, userLongitude);
    //캐싱
    let settingLocationCafeteria = await redisClient.v4.set(
      redisKey,
      JSON.stringify(data)
    );
    await redisClient.v4.expire(redisKey, 3600); //1시간만 보관
    if (settingLocationCafeteria) {
      console.log("사용자 위치에 따른 급식소 정보 저장성공");
    } else {
      console.log("사용자 위치에 따른 급식소 정보 저장실패");
    }
  }
  console.log(data.length);
  res.status(200).json(data);
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
