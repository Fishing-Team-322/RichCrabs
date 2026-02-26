import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home/Home';
import Quiz from './pages/Quiz/Quiz';
import Profile from './pages/Profile/Profile';
import OpenGames from './pages/OpenGames/OpenGames';
import Subscriptions from './pages/Subscriptions/Subscriptions';
import TelegramBots from './pages/TelegramBots/TelegramBots';
import CreateRoom from './pages/CreateRoom/CreateRoom';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/quiz/:pin" element={<Quiz />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/games" element={<OpenGames />} />
      <Route path="/subscriptions" element={<Subscriptions />} />
      <Route path="/bots" element={<TelegramBots />} />
      <Route path="/create-room" element={<CreateRoom />} />
    </Routes>
  );
};

export default AppRoutes;