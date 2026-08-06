import { Router, type IRouter } from "express";
import arcadeRouter from "./arcade";
import discordRouter from "./discord";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discordRouter);
router.use(arcadeRouter);

export default router;
