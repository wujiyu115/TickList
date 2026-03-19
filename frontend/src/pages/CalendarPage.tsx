import React from 'react';
import CalendarView from '../components/CalendarView/CalendarView';
import './CalendarPage.less';

const CalendarPage: React.FC = () => {
  return (
    <div className="calendar-page">
      <CalendarView />
    </div>
  );
};

export default CalendarPage;
