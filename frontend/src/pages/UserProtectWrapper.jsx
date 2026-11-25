import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserDataContext } from '../context/UserContext';
import { FullScreenLoader } from '../components/ui/AuthLayout';

const UserProtectWrapper = ({ children }) => {
  const token = localStorage.getItem('userToken');
  const navigate = useNavigate();
  const { setUser } = useContext(UserDataContext); // Get setUser from context
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/Userlogin');
      return;
    }

    axios.get(`${import.meta.env.VITE_BASE_URL}/users/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.status === 200) {
        setUser(response.data);
        setIsLoading(false);
      }
    })
    .catch((error) => {
      console.log(error);
      localStorage.removeItem('userToken');
      navigate('/Userlogin');
    });
  }, [token, navigate, setUser]);

  if (isLoading) {
    return <FullScreenLoader label="Loading" />;
  }

  return <>{children}</>;
};

export default UserProtectWrapper;