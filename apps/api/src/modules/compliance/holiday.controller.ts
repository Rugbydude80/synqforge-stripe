import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@Controller('holiday')
export class HolidayController {
  @Post('timesheets/import')
  async importTimesheets(@Body() body: any) {
    return { imported: Array.isArray(body) ? body.length : 0 };
  }

  @Post('calc')
  async calc(@Body() body: { hours: number; rate: number; rolledUp?: boolean }) {
    const accrualPercent = 12.07 / 100;
    const accruedHours = body.hours * accrualPercent;
    const rolledUpPay = body.rolledUp ? accruedHours * body.rate : 0;
    return { accrualPercent: 12.07, accruedHours, rolledUpPay };
  }

  @Get('export/:system')
  async export(@Query('period') period?: string) {
    return { url: 'https://example.com/holiday.csv' };
  }
}

