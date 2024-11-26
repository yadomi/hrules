import mqtt from "npm:mqtt";
import jexl from "npm:@digifi/jexl";
import { parse } from "jsr:@std/yaml";
import Logger from "https://deno.land/x/logger/logger.ts";

const logger = new Logger();
const settings = parse(await Deno.readTextFile(Deno.args[0] || "./config/hrules.yml"));

const client = mqtt.connect(settings.mqtt.host, settings.mqtt.options);
const definitions = await Deno.readTextFile("./config/hrules.rules");

const Utils = {
  now() {
    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const currentDate = new Date();
    return {
      weekday: weekdays[currentDate.getDay()],
      minutes: 60 * currentDate.getHours() + currentDate.getMinutes(),
    };
  },
  withinHoursExpression(timeRange: string): boolean {
    const now = Utils.now();

    for (const hourRange of timeRange.split(",")) {
      const [startTime, endTime] = hourRange.split("-").map(time => {
        const [hours, minutes] = time.split(":");
        return Number(hours) * 60 + Number(minutes);
      });

      if (now.minutes >= startTime && now.minutes <= endTime) {
        return true;
      }
    }
    return false;
  },
  withinTimeExpression(timeExpression: string) {
    const regex = /((?<weekday>(?:[A-Z][a-z]-?)+)\s?)?(?<hoursExpression>.+)/;
    let isWithinRange = false;

    for (const part of timeExpression.split(";")) {
      const trimmedPart = part.trim();
      const match = regex.exec(trimmedPart);

      if (!match) continue;
      if (!match.groups) continue;

      const { weekday, hoursExpression } = match.groups;

      if (weekday) {
        const specifiedWeekdays = weekday.split("-");
        if (specifiedWeekdays.includes(Utils.now().weekday)) {
          isWithinRange = Utils.withinHoursExpression(hoursExpression);
        }
      } else {
        isWithinRange = Utils.withinHoursExpression(hoursExpression);
      }
    }

    return isWithinRange;
  },
  parseReplyExpression(str: string, originalPayload: string | Record<string, unknown>) {
    const [topic, ...responsePayload] = str.split(" ") ?? [];
    const payload = new Function("const [payload] = arguments; return " + responsePayload.join(" "))(originalPayload);

    return [topic.trim(), typeof payload === "string" ? payload : JSON.stringify(payload)];
  },
};

const triggers = new Map<
  string,
  ((context: string | Record<string, unknown>) => Promise<(() => void) | undefined>)[]
>();

async function main() {
  logger.info("[Init] Connected to MQTT broker");

  let i = 1;
  for (const line of definitions.trim().split("\n")) {
    const definition = line.split("->").map(x => x.trim()) as [string, string, string];

    if (definition.length < 3) {
      continue;
    }

    if (definition[0].startsWith("#")) {
      continue;
    }

    const [inputExpression, expression, replyExpression] = definition;
    const [topic, timeExpression] = inputExpression.split("|").map(x => x.trim());

    const fn = async (context: string | Record<string, unknown>) => {
      const passTimeExpression = timeExpression ? Utils.withinTimeExpression(timeExpression) : true;
      if (!passTimeExpression) return;

      const passEvalExpression = await jexl.eval(expression, {
        payload: context,
        global: {
          ts: new Date().getTime(),
        },
      });
      if (!passEvalExpression) return;

      logger.info(`[Sub] Incoming ${topic}`);

      return () => {
        try {
          const [replyTopic, replyPayload] = Utils.parseReplyExpression(replyExpression, context);
          client.publish(replyTopic, replyPayload);
          logger.info(`[Pub] ${topic} -> ${replyTopic}`);
        } catch (e) {
          logger.error(e);
        }
      };
    };

    if (triggers.has(topic)) {
      const actions = triggers.get(topic);
      if (actions) {
        actions.push(fn);
        triggers.set(topic, actions);
      }
    } else {
      triggers.set(topic, [fn]);
      client.subscribe(topic);
      logger.info(`[Init] Subcribed to ${topic}`);
    }

    i++;
  }

  client.on("message", async (topic, message) => {
    const actions = triggers.get(topic);
    if (!actions) return;

    for (const action of actions) {
      if (!action) continue;

      let payload = message;
      try {
        payload = JSON.parse(payload.toString());
      } catch (e) {
        logger.error(e);
      }

      const callback = await action(payload);
      if (callback) {
        await callback();
      }
    }
  });
}

client.on("connect", main);
