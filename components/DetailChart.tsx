import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js'
import { LatencyRecord } from '@/types/config'
import { codeToCountry } from '@/util/iata'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
)

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function DetailChart({ data: series }: { data: LatencyRecord[] }) {
  const latencyData = series.map((point) => ({
    x: point.time * 1000,
    y: point.ping,
    loc: point.loc,
  }))

  let data = {
    datasets: [
      {
        data: latencyData,
        borderColor: 'rgb(112, 119, 140)',
        borderWidth: 2,
        radius: 0,
        cubicInterpolationMode: 'monotone' as const,
        tension: 0.4,
      },
    ],
  }

  let options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    animation: {
      duration: 0,
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items: any) => formatTime(items[0].parsed.x),
          label: (item: any) => {
            if (item.parsed.y) {
              return `${item.parsed.y}ms (${codeToCountry(item.raw.loc)})`
            }
          },
        },
      },
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Response times(ms)',
        align: 'start' as const,
      },
    },
    scales: {
      // Linear scale over millisecond timestamps avoids pulling in a date
      // adapter (and moment.js); ticks are formatted as time-of-day below.
      x: {
        type: 'linear' as const,
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          callback: (value: any) => formatTime(Number(value)),
        },
      },
    },
  }

  return (
    <div style={{ height: '150px' }}>
      <Line options={options} data={data} />
    </div>
  )
}
