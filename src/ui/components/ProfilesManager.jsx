import React, { useState } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Grid,
  Chip,
  Avatar,
  IconButton
} from '@mui/material';
import { 
  FlashOn, 
  Shield, 
  CloudQueue, 
  Settings,
  MoreVert,
  Terminal
} from '@mui/icons-material';

const ProfilesManagerV3 = () => {
  const [profiles, setProfiles] = useState([
    { id: 1, name: 'Marketer USA', status: 'ready', engine: 'Chromium 142' },
    { id: 2, name: 'E-commerce EU', status: 'running', engine: 'Safari 19' },
    { id: 3, name: 'Mobile LATAM', status: 'ready', engine: 'Mobile Chrome' }
  ]);

  return (
    <Box sx={{ p: 4, bgcolor: '#0f172a', minHeight: '100vh', color: '#fff' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 6 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            MULTILOGIN SUPERIOR V3
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            IA-Driven Privacy Engine & Distributed Browser Nodes
          </Typography>
        </Box>
        <Button variant="contained" sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, borderRadius: 2, textTransform: 'none', px: 4 }}>
          Initialize Cluster
        </Button>
      </Box>

      <Grid container spacing={3}>
        {profiles.map((p) => (
          <Grid item xs={12} md={6} lg={4} key={p.id}>
            <Card sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: 4, border: '1px solid #334155' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#3b82f6' }}><FlashOn /></Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{p.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>{p.engine}</Typography>
                    </Box>
                  </Box>
                  <IconButton sx={{ color: '#64748b' }}><MoreVert /></IconButton>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, my: 2 }}>
                  <Chip label={p.status} size="small" color={p.status === 'running' ? 'success' : 'default'} sx={{ color: '#fff' }} />
                  <Chip label="Predictive Evasion" size="small" icon={<Shield sx={{ fontSize: '14px !important' }} />} sx={{ bgcolor: '#0ea5e9', color: '#fff' }} />
                </Box>

                <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
                  <Button fullWidth variant="contained" sx={{ bgcolor: '#3b82f6' }}>Launch</Button>
                  <IconButton sx={{ bgcolor: '#334155', color: '#fff' }}><Terminal /></IconButton>
                  <IconButton sx={{ bgcolor: '#334155', color: '#fff' }}><Settings /></IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ProfilesManagerV3;
