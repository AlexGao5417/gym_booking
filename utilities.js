const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/calendar.events'];
const TOKEN_PATH = 'token.json';
const constants = require('./module/constants')
const oneDayUTC = 86400000

dailySlotsCheck = (events, dayStart) => {
  
  let courseSlots = [...constants.slotsTimes.courseSlots]
  events.map((event, i) => {
    const start = event.start.dateTime || event.start.date;        
    if ((Date.parse(start) - dayStart) < oneDayUTC) {
      startTime = `${start.slice(11, 19)}`
      courseSlots.map((courseTime, i_start) => {
        if (startTime === courseTime.startTime) {
          console.log(startTime);
          courseSlots.splice(i_start, 1)
        }
      })
    }    
  });
  return courseSlots
}


checkMonthlySchedule = (events,date) => {
  let monthlySchedule = {"success": false, "days": []}
  let monthSlots = new Object()
  const firstDateOfMonth = new Date(`${date.month} 01, ${date.year} 9:00:00`).toISOString()
  //2019-09-13T12:00:00+10:00 event
  const dayInMonth = new Date(date.year, date.month, 0).getDate()
  for (let dayCount = 1; dayCount <= dayInMonth; dayCount++){
    monthSlots[dayCount] = []
  }
  events.map((event, i) => {
    const start = event.start.dateTime || event.start.date;     
    const startTime = Date.parse(new Date(start))
    for (let dayCount = 1; dayCount <= dayInMonth; dayCount++){
      let dayStart = Date.parse(new Date(`${date.month} ${dayCount}, ${date.year} 09:00:00`))
      let dayEnd = Date.parse(new Date(`${date.month} ${dayCount}, ${date.year} 18:00:00`))
      if (startTime >= dayStart && startTime < dayEnd){
        monthSlots[dayCount].push(start)
      }
    }
  })
  console.log(monthSlots);
  
  for (key in monthSlots){
    let freeSlots = monthSlots[key].length
    let hasTimeSlots = freeSlots !== 16
    if (hasTimeSlots){monthlySchedule.success = true}
    monthlySchedule.days.push(`{"day": ${key},  "hasTimeSlots": ${hasTimeSlots} }`)
  }
  
  console.log(monthSlots);
  
  return monthlySchedule
}


checkDailySchedule = (events, date) => {
  const dayStart = new Date(`${date.month} ${date.day}, ${date.year} 09:00:00`)
  let returnSlots = { "success": false, "timeSlots": [] }
  let courseSlots = dailySlotsCheck(events, dayStart)
  if (!courseSlots[0]) { return returnSlots };
  returnSlots.success = true;
  courseSlots.map((courseTime, i) => {
    returnSlots.timeSlots.push(
      {
        startTime:new Date(`${date.month} ${date.day}, ${date.year} ${courseTime.startTime}`).toISOString(),
        endTime:new Date(`${date.month} ${date.day}, ${date.year} ${courseTime.endTime}`).toISOString()
      }
    )
  })
  
  return returnSlots;
}



exports.listMonthEvents = async (auth, date) => {
  // use this params if we need check for one month 
  listParams = {
    calendarId: 'primary',
    timeMin: (new Date(`${date.month} 01, ${date.year} 09:00:00`)).toISOString(),
    maxResults: 20,
    singleEvents: true,
    orderBy: 'startTime',
  }
  return new Promise((resolve, reject) => {
    if (errorDateHandler(resolve, date, "monthlyCheck")) return
    // use this params if we need check for one day 

    const calendar = google.calendar({ version: 'v3', auth });
    calendar.events.list(listParams, (err, res) => {
      if (err) reject('The API returned an error: ' + err);
      const events = res.data.items;
      resolve(checkMonthlySchedule(events, date));
    });
  })
}

exports.listDailyEvents = async (auth, date) => {
  listParams = {
    calendarId: 'primary',
    timeMin: new Date(`${date.year}/${date.month}/${date.day}`),
    maxResults: 20,
    singleEvents: true,
    orderBy: 'startTime',
  }

  const calendar = google.calendar({ version: 'v3', auth });

  return new Promise((resolve, reject) => {
    if(errorDateHandler(resolve, date, "dailyCheck")) return
    calendar.events.list(listParams, (err, res) => {
      if (err) reject('The API returned an error: ' + err);
      const events = res.data.items;
      resolve(checkDailySchedule(events, date));
    })
  })
}

exports.postNewEvent = async (auth, date) => {
  const lagAdjust = constants.constants.lagAdjust;
  const fourtyMinutes = constants.constants.fourtyMinutesUTC;
  const startTime = new Date(`${date.month} ${date.day}, ${date.year} ${date.hour}:${date.minute}:00`)
  const endTime = new Date(Date.parse(startTime) + fourtyMinutes);
  //add 10 hours to get ISO time
  const startTimeAdjust = new Date(Date.parse(startTime) + lagAdjust);
  const endTimeAdjust = new Date(Date.parse(startTimeAdjust) + fourtyMinutes)
  const today = new Date()
  console.log(startTimeAdjust);
  
  event = {
    'start': { 'dateTime': `${startTime.toISOString()}` },
    'end': { 'dateTime': `${endTime.toISOString()}` },
  }
  console.log(event);
  
  listParams = { calendarId: 'primary', resource: event };
  const calendar = google.calendar({ version: 'v3', auth });
  return new Promise((resolve, reject) => {
    //error handling  
    if(errorDateHandler(resolve, date, "postNewEvent")) return 
    if (!constants.startTimeSlots.includes(`${startTimeAdjust.toISOString().slice(11, 19)}`)) {
      resolve({
        "success": false,
        "message": "Invalid time slot"
      })
      return
    }
    if ((startTimeAdjust - today) < constants.constants.oneDayUTC) {
      resolve({
        "success": false,
        "message": "Cannot book with less than 24 hours in advance"
      })
      return
    }
    if (startTime.getHours() > 17 || startTime.getHours() < 9) {
      resolve({
        "success": false,
        "message": "Cannot book outside bookable timeframe"
      })
      return
    }
    if (startTime < today) {
      resolve({
        "success": false,
        "message": "Cannot book time in the past"
      })
      return
    }
    let result = null
    calendar.events.insert(listParams, (err, res) => {
      if (err) reject('The API returned an error: ' + err);
      result = {
        "success": true,
        "startTime": event.start.dateTime,
        "endTime": event.end.dateTime
      }
      console.log(result);
      resolve(result)
    })
  })
}


errorDateHandler = (resolve, date, type) => {
  if (!date.month) {
    resolve({
      "success": false,
      "message": "Request is missing parameter: month"
    })
    return true
  }
  if (!date.year) {
    resolve({
      "success": false,
      "message": "Request is missing parameter: year"
    })
    return true
  }
  if(type === "monthlyCheck") return false
  if (!date.day) {
    resolve({
      "success": false,
      "message": "Request is missing parameter: day"
    })
    return true
  }
  if(type === "dailyCheck") return false
  if (!date.minute) {
    resolve({
      "success": false,
      "message": "Request is missing parameter: minute"
    })
    return true
  }
  return false
}

exports.authenticate = async (date, action) => {
  let result = null
  return new Promise((resolve, reject) => {
  fs.readFile('credentials.json', async (err, content) => {
    if (err) reject('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Calendar API.
    const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    await fs.readFile(TOKEN_PATH, async (err, token) => {
      if (err) reject(oAuth2Client, () => {console.log(err);});
      oAuth2Client.setCredentials(JSON.parse(token));
      result = await action(oAuth2Client, date)
      resolve(result)
    });
  });
})
}