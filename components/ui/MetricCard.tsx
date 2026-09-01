import React from 'react';
import { Card } from '@/components/ui/Card';
import { IconType } from 'react-icons';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: IconType;
}

export function MetricCard({ title, value, subtitle, icon: Icon }: MetricCardProps) {
  return (
    <Card className="p-4 sm:p-6 flex flex-col justify-between hover:-translate-y-1 transition-transform cursor-default h-full">
      <div className="flex justify-between items-start gap-2">
        <div className="bg-[#2C3829]/10 p-2.5 sm:p-3 rounded-lg shrink-0">
          <Icon className="text-[#2C3829] text-xl sm:text-2xl" />
        </div>
        <span className="text-[#2C3829]/60 font-label-sm text-right text-[11px] leading-tight sm:text-xs">{subtitle}</span>
      </div>
      <div className="mt-5 sm:mt-8">
        <span className="text-[#2C3829] font-jost font-semibold block text-3xl sm:text-4xl mb-1">{value}</span>
        <span className="text-[#2C3829]/80 font-label-md uppercase tracking-wide sm:tracking-widest text-[10px] sm:text-xs">{title}</span>
      </div>
    </Card>
  );
}
