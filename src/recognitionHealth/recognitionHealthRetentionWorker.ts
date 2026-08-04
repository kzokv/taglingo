import type { D1Database } from "../fx/cloudflareInfrastructure";
import { createD1RecognitionHealthAggregateStore } from "./cloudflareRecognitionHealth";

interface ScheduledController {
  scheduledTime: number;
}

interface Environment {
  DB: D1Database;
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Environment
  ): Promise<void> {
    const throughDay = new Date(controller.scheduledTime)
      .toISOString()
      .slice(0, 10);
    await createD1RecognitionHealthAggregateStore(env.DB).expire(throughDay);
  }
};
