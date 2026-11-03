import "./ui/style.css";
import { startMeasure } from "./measure/index";
import { mountApp } from "./ui/app";

const today = new Date();
mountApp(document.getElementById("app")!, today, startMeasure(window, today));
