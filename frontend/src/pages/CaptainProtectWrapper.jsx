import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaptainDataContext } from '../context/CaptainContext';
import axios from 'axios';
import { FullScreenLoader } from '../components/ui/AuthLayout';

const CaptainProtectWrapper = ({ children }) => {
    const token = localStorage.getItem('captainToken');
    const navigate = useNavigate();
    const { setCaptain } = useContext(CaptainDataContext);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!token) {
            navigate('/captainlogin');
            return;
        }

        axios.get(`${import.meta.env.VITE_BASE_URL}/captains/profile`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
        .then((response) => {
            if (response.status === 200) {
                setCaptain(response.data.captain);
                setIsLoading(false);
            }
        })
        .catch((error) => {
            console.error("Profile Fetch Error:", error);
            localStorage.removeItem('captainToken');
            navigate('/captainlogin');
        });
    }, [token, navigate, setCaptain]); // Logic stays safely inside here

    if (isLoading) {
        return <FullScreenLoader dark label="Loading captain profile" />;
    }

    return <>{children}</>;
};

export default CaptainProtectWrapper;