type MetricLabels = Record<string,string>;
type Counter = {value:number; labels:MetricLabels};
type Histogram = {sum:number; count:number; buckets:Map<number,number>; labels:MetricLabels};

const LABEL_ALLOWLIST = new Set(["route","method","status","mode","channel","outcome"]);
const MAX_LABEL_VALUE = 80;
const MAX_SERIES = 500;
const BUCKETS = [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2,5,10];

function normalize(labels:MetricLabels):MetricLabels {
  const out:MetricLabels = {};
  for (const [key,value] of Object.entries(labels)) {
    if (!LABEL_ALLOWLIST.has(key)) continue;
    out[key] = value.slice(0,MAX_LABEL_VALUE).replace(/[^a-zA-Z0-9_./:-]/g,"_");
  }
  return out;
}
function seriesKey(labels:MetricLabels):string {
  return Object.entries(labels).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join(",");
}

export class MetricsRegistry {
  private readonly counters = new Map<string,Counter>();
  private readonly histograms = new Map<string,Histogram>();

  inc(name:string, labels:MetricLabels={}, value=1):void {
    if (!Number.isFinite(value) || value < 0) return;
    const normalized=normalize(labels), key=name+"|"+seriesKey(normalized);
    if (!this.counters.has(key) && this.counters.size >= MAX_SERIES) return;
    const current=this.counters.get(key);
    if (current) current.value += value;
    else this.counters.set(key,{value,labels:normalized});
  }

  observe(name:string, seconds:number, labels:MetricLabels={}):void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const normalized=normalize(labels), key=name+"|"+seriesKey(normalized);
    if (!this.histograms.has(key) && this.histograms.size >= MAX_SERIES) return;
    let current=this.histograms.get(key);
    if (!current) {
      current={sum:0,count:0,buckets:new Map(BUCKETS.map(b=>[b,0])),labels:normalized};
      this.histograms.set(key,current);
    }
    current.sum += seconds; current.count += 1;
    for (const bucket of BUCKETS) if (seconds <= bucket) current.buckets.set(bucket,(current.buckets.get(bucket)??0)+1);
  }

  toPrometheus():string {
    const lines:string[]=[];
    for (const [key,c] of this.counters) {
      const name=key.split("|",1)[0], labels=formatLabels(c.labels);
      lines.push(name + labels + " " + c.value);
    }
    for (const [key,h] of this.histograms) {
      const name=key.split("|",1)[0], base=h.labels;
      for (const bucket of BUCKETS) lines.push(name+"_bucket"+formatLabels({...base,le:String(bucket)})+" "+(h.buckets.get(bucket)??0));
      lines.push(name+"_bucket"+formatLabels({...base,le:"+Inf"})+" "+h.count);
      lines.push(name+"_sum"+formatLabels(base)+" "+h.sum);
      lines.push(name+"_count"+formatLabels(base)+" "+h.count);
    }
    return lines.join("\n")+"\n";
  }
}

function formatLabels(labels:MetricLabels):string {
  const entries=Object.entries(labels);
  if (!entries.length) return "";
  return "{"+entries.map(([k,v])=>k+"="+JSON.stringify(v)).join(",")+"}";
}
