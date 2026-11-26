import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Userlogin from './pages/Userlogin';
import Usersignup from './pages/Usersignup';
import Captainlogin from './pages/Captainlogin';
import Captainsignup from './pages/Captainsignup';
import Start from './pages/Start1';
import UserProtectWrapper from './pages/UserProtectWrapper';
import Userlogout from './pages/Userlogout';
import CaptainHome from './pages/CaptainHome';
import CaptainProtectWrapper from './pages/CaptainProtectWrapper';
import Riding from './pages/Riding';
import CaptainRiding from './pages/CaptainRiding';
import Account from './pages/Account';
import TrackTrip from './pages/TrackTrip';
import CaptainVerify from './pages/CaptainVerify';
import AdminReview from './pages/AdminReview';
const App = () => {
  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Start />} /> 
        <Route path="/home" element={
          <UserProtectWrapper>
            <Home />
          </UserProtectWrapper>
        } />
        <Route path="/account" element={
          <UserProtectWrapper>
            <Account />
          </UserProtectWrapper>
        } />
        <Route path="/Userlogin" element={<Userlogin />} />
        <Route path="/riding" element={
          <UserProtectWrapper>
            <Riding />
          </UserProtectWrapper>
        } />
        <Route path="/start-ride" element={
          <UserProtectWrapper>
            <Riding />
          </UserProtectWrapper>
        } />
        {/* Public: live trip link shared with trusted contacts (no login). */}
        <Route path="/track/:token" element={<TrackTrip />} />

        <Route path="/usersignup" element={<Usersignup />} />
        <Route path="/captainlogin" element={<Captainlogin />} />
        <Route path="/captainsignup" element={<Captainsignup />} />
        <Route path="/user/logout" element={
          <UserProtectWrapper>
            <Userlogout />
          </UserProtectWrapper>
        } />
        <Route path="/captainhome" element={
          <CaptainProtectWrapper>
            <CaptainHome />
          </CaptainProtectWrapper>
        } />
        <Route path="/captain/verify" element={
          <CaptainProtectWrapper>
            <CaptainVerify />
          </CaptainProtectWrapper>
        } />
        {/* Team-only: approve or reject verifications (needs the ADMIN_KEY). */}
        <Route path="/admin/review" element={<AdminReview />} />
        <Route path="/captain-riding" element={
          <CaptainProtectWrapper>
            <CaptainRiding />
          </CaptainProtectWrapper>
        } />
      </Routes>
    </div>
  );
}

export default App;