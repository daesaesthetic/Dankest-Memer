import { Router, type IRouter } from "express";
import discordRouter from "./discord";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discordRouter);

export default router;
