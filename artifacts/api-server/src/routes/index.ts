import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import companiesRouter from "./companies";
import declarationsRouter from "./declarations";
import pdfRouter from "./pdf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(companiesRouter);
router.use(declarationsRouter);
router.use(pdfRouter);

export default router;
