import React from 'react';
import PomodoroTimer from '../components/PomodoroTimer/PomodoroTimer';
import './PomodoroPage.less';

const PomodoroPage: React.FC = () => {
  return (
    <div className="pomodoro-page">
      <PomodoroTimer />
    </div>
  );
};

export default PomodoroPage;
