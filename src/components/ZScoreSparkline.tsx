import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface ZScoreSparklineProps {
  data: number[];
}

export const ZScoreSparkline: React.FC<ZScoreSparklineProps> = ({ data }) => {
  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [
      {
        data: data,
        borderColor: "#10b981",
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, min: -4, max: 4 },
    },
  };

  return (
    <div className="h-16 w-full px-4">
      <Line data={chartData} options={options} />
    </div>
  );
};
