import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import companiesRouter from "./companies";
import declarationsRouter from "./declarations";
import pdfRouter from "./pdf";
import filesRouter from "./files";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(companiesRouter);
router.use(declarationsRouter);
router.use(pdfRouter);
router.use(filesRouter);
router.use(adminRouter);

export default router;
