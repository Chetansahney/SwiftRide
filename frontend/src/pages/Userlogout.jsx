import { useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FullScreenLoader } from '../components/ui/AuthLayout';

export const Userlogout = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('userToken');
        axios
            .get(`${import.meta.env.VITE_BASE_URL}/users/logout`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .catch((error) => console.error('Logout failed:', error.response?.data || error.message))
            .finally(() => {
                localStorage.removeItem('userToken');
                navigate('/Userlogin');
            });
    }, [navigate]);

    return <FullScreenLoader label="Logging out" />;
};

export default Userlogout;
