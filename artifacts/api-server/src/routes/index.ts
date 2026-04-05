import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import companiesRouter from "./companies";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(companiesRouter);

export default router;
