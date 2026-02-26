import React from "react";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export function MetricCard(props: {
  title: string;
  value: string;
  sub: string;
  tone?: "blue" | "violet" | "orange" | "green" | "red" | "gray";
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("metric", props.tone || "gray")}>
      <div className="metricTop">
        {props.icon ? <div className="metricIcon">{props.icon}</div> : null}
        <div className="metricMeta">
          <div className="metricTitle">{props.title}</div>
          <div className="metricSub">{props.sub}</div>
        </div>
      </div>
      <div className="metricValue">{props.value}</div>
      <div className="metricGlow" />
    </div>
  );
}