const { google } = require("googleapis");

// Banana=5, Tomato=11, Graphite=8 → unavailable; Blueberry=9 → public
// Any other color on an event also defaults to unavailable
const PUBLIC_COLOR = "9";
const BLOCK_COLORS = new Set(["5", "11", "8"]);

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  try {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return { statusCode: 200, body: JSON.stringify({ error: true }) };
    }

    const startParam = event.queryStringParameters?.start;
    if (!startParam || !/^\d{4}-\d{2}-\d{2}$/.test(startParam)) {
      return { statusCode: 200, body: JSON.stringify({ error: true }) };
    }

    const startDate = new Date(startParam + "T00:00:00Z");
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 3);

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
    });

    const events = response.data.items || [];
    const dayMap = {};

    for (const ev of events) {
      const isAllDay = !!ev.start.date;
      const evStart = ev.start.date || ev.start.dateTime.slice(0, 10);
      const colorId = ev.colorId || null;
      const state = colorId === PUBLIC_COLOR ? "public" : "unavailable";

      if (isAllDay) {
        let cur = evStart;
        while (cur < ev.end.date) {
          if (!dayMap[cur] || (dayMap[cur] === "public" && state === "unavailable")) {
            dayMap[cur] = state;
          }
          cur = addDays(cur, 1);
        }
      } else {
        if (!dayMap[evStart] || (dayMap[evStart] === "public" && state === "unavailable")) {
          dayMap[evStart] = state;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify(dayMap),
    };
  } catch (err) {
    console.error("Availability error:", err.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ error: true }),
    };
  }
};
