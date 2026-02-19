<?php
/**
 * Plugin Name: Clara ProRadio Sync
 * Description: Allows Clara to sync show schedules to ProRadio via REST API
 * Version: 1.0.0
 * Author: Koodh
 */

if (!defined('ABSPATH')) {
    exit;
}

class Clara_ProRadio_Sync {
    
    public function __construct() {
        add_action('rest_api_init', array($this, 'register_routes'));
    }
    
    public function register_routes() {
        register_rest_route('clara/v1', '/schedule/update', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_schedule'),
            'permission_callback' => array($this, 'check_permission'),
        ));
        
        register_rest_route('clara/v1', '/schedule/(?P<day>[a-z]+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_schedule'),
            'permission_callback' => '__return_true',
        ));
        
        register_rest_route('clara/v1', '/shows', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_shows'),
            'permission_callback' => '__return_true',
        ));
    }
    
    public function check_permission($request) {
        // Check for Application Password authentication
        $user = wp_get_current_user();
        if ($user->ID === 0) {
            return new WP_Error('unauthorized', 'Authentication required', array('status' => 401));
        }
        
        // User must be able to edit posts
        if (!current_user_can('edit_posts')) {
            return new WP_Error('forbidden', 'Insufficient permissions', array('status' => 403));
        }
        
        return true;
    }
    
    public function get_shows($request) {
        $args = array(
            'post_type' => 'shows',
            'posts_per_page' => -1,
            'post_status' => 'publish',
        );
        
        $shows = get_posts($args);
        $result = array();
        
        foreach ($shows as $show) {
            $result[] = array(
                'id' => $show->ID,
                'title' => $show->post_title,
                'slug' => $show->post_name,
            );
        }
        
        return rest_ensure_response($result);
    }
    
    public function get_schedule($request) {
        $day = sanitize_text_field($request['day']);
        
        // Map day names
        $day_map = array(
            'maandag' => 'maandag',
            'dinsdag' => 'dinsdag', 
            'woensdag' => 'woensdag',
            'donderdag' => 'donderdag',
            'vrijdag' => 'vrijdag',
            'zaterdag' => 'zaterdag',
            'zondag' => 'zondag',
            'monday' => 'maandag',
            'tuesday' => 'dinsdag',
            'wednesday' => 'woensdag',
            'thursday' => 'donderdag',
            'friday' => 'vrijdag',
            'saturday' => 'zaterdag',
            'sunday' => 'zondag',
        );
        
        $day_name = isset($day_map[strtolower($day)]) ? $day_map[strtolower($day)] : $day;
        
        // Find schedule post
        $args = array(
            'post_type' => 'schedule',
            'posts_per_page' => 1,
            'title' => $day_name,
            'post_status' => 'publish',
        );
        
        $schedules = get_posts($args);
        
        if (empty($schedules)) {
            return new WP_Error('not_found', 'Schedule not found for ' . $day_name, array('status' => 404));
        }
        
        $schedule = $schedules[0];
        $shows = get_post_meta($schedule->ID, 'shows', true);
        
        return rest_ensure_response(array(
            'id' => $schedule->ID,
            'day' => $day_name,
            'shows' => $shows ? $shows : array(),
        ));
    }
    
    public function update_schedule($request) {
        $params = $request->get_json_params();
        
        if (empty($params['day'])) {
            return new WP_Error('missing_day', 'Day parameter is required', array('status' => 400));
        }
        
        $day = sanitize_text_field($params['day']);
        
        // Map day names
        $day_map = array(
            'maandag' => 'maandag',
            'dinsdag' => 'dinsdag', 
            'woensdag' => 'woensdag',
            'donderdag' => 'donderdag',
            'vrijdag' => 'vrijdag',
            'zaterdag' => 'zaterdag',
            'zondag' => 'zondag',
            'monday' => 'maandag',
            'tuesday' => 'dinsdag',
            'wednesday' => 'woensdag',
            'thursday' => 'donderdag',
            'friday' => 'vrijdag',
            'saturday' => 'zaterdag',
            'sunday' => 'zondag',
        );
        
        $day_name = isset($day_map[strtolower($day)]) ? $day_map[strtolower($day)] : $day;
        
        // Find schedule post
        $args = array(
            'post_type' => 'schedule',
            'posts_per_page' => 1,
            'post_status' => 'publish',
            's' => $day_name,
        );
        
        $schedules = get_posts($args);
        
        // Also try by exact title match
        if (empty($schedules)) {
            global $wpdb;
            $schedule_id = $wpdb->get_var($wpdb->prepare(
                "SELECT ID FROM $wpdb->posts WHERE post_type = 'schedule' AND post_status = 'publish' AND LOWER(post_title) = %s",
                strtolower($day_name)
            ));
            
            if ($schedule_id) {
                $schedules = array(get_post($schedule_id));
            }
        }
        
        if (empty($schedules)) {
            return new WP_Error('not_found', 'Schedule not found for ' . $day_name, array('status' => 404));
        }
        
        $schedule = $schedules[0];
        $schedule_id = $schedule->ID;
        
        // Handle different update modes
        $mode = isset($params['mode']) ? $params['mode'] : 'add';
        
        // Get current shows
        $current_shows = get_post_meta($schedule_id, 'shows', true);
        if (!is_array($current_shows)) {
            $current_shows = array();
        }
        
        if ($mode === 'replace') {
            // Replace entire schedule
            if (!isset($params['shows']) || !is_array($params['shows'])) {
                return new WP_Error('missing_shows', 'Shows array is required for replace mode', array('status' => 400));
            }
            
            $new_shows = array();
            foreach ($params['shows'] as $show) {
                $new_shows[] = array(
                    'show_id' => array(strval($show['show_id'])),
                    'show_time' => sanitize_text_field($show['start_time']),
                    'show_time_end' => sanitize_text_field($show['end_time']),
                );
            }
            
            update_post_meta($schedule_id, 'shows', $new_shows);
            
            return rest_ensure_response(array(
                'success' => true,
                'message' => 'Schedule replaced',
                'schedule_id' => $schedule_id,
                'day' => $day_name,
                'shows_count' => count($new_shows),
            ));
            
        } else if ($mode === 'add' || $mode === 'update') {
            // Add or update a single show slot
            if (!isset($params['show_id']) || !isset($params['start_time']) || !isset($params['end_time'])) {
                return new WP_Error('missing_params', 'show_id, start_time, and end_time are required', array('status' => 400));
            }
            
            $show_id = strval($params['show_id']);
            $start_time = sanitize_text_field($params['start_time']);
            $end_time = sanitize_text_field($params['end_time']);
            
            // Remove existing slot with same time or same show at same time
            $updated_shows = array();
            $found = false;
            
            foreach ($current_shows as $show) {
                $existing_start = isset($show['show_time']) ? $show['show_time'] : '';
                $existing_end = isset($show['show_time_end']) ? $show['show_time_end'] : '';
                $existing_id = isset($show['show_id']) ? (is_array($show['show_id']) ? $show['show_id'][0] : $show['show_id']) : '';
                
                // Skip if same time slot (we'll add the new one)
                if ($existing_start === $start_time && $existing_end === $end_time) {
                    $found = true;
                    continue;
                }
                
                $updated_shows[] = $show;
            }
            
            // Add the new show slot
            $updated_shows[] = array(
                'show_id' => array($show_id),
                'show_time' => $start_time,
                'show_time_end' => $end_time,
            );
            
            // Sort by start time
            usort($updated_shows, function($a, $b) {
                $time_a = isset($a['show_time']) ? $a['show_time'] : '00:00';
                $time_b = isset($b['show_time']) ? $b['show_time'] : '00:00';
                return strcmp($time_a, $time_b);
            });
            
            update_post_meta($schedule_id, 'shows', $updated_shows);
            
            return rest_ensure_response(array(
                'success' => true,
                'message' => $found ? 'Show slot updated' : 'Show slot added',
                'schedule_id' => $schedule_id,
                'day' => $day_name,
                'show_id' => $show_id,
                'start_time' => $start_time,
                'end_time' => $end_time,
                'total_shows' => count($updated_shows),
            ));
            
        } else if ($mode === 'remove') {
            // Remove a show slot
            $start_time = isset($params['start_time']) ? sanitize_text_field($params['start_time']) : null;
            $end_time = isset($params['end_time']) ? sanitize_text_field($params['end_time']) : null;
            $show_id = isset($params['show_id']) ? strval($params['show_id']) : null;
            
            $updated_shows = array();
            $removed = false;
            
            foreach ($current_shows as $show) {
                $existing_start = isset($show['show_time']) ? $show['show_time'] : '';
                $existing_end = isset($show['show_time_end']) ? $show['show_time_end'] : '';
                $existing_id = isset($show['show_id']) ? (is_array($show['show_id']) ? $show['show_id'][0] : $show['show_id']) : '';
                
                // Check if this is the slot to remove
                $should_remove = false;
                
                if ($start_time && $end_time && $existing_start === $start_time && $existing_end === $end_time) {
                    $should_remove = true;
                } else if ($show_id && $existing_id === $show_id && (!$start_time || $existing_start === $start_time)) {
                    $should_remove = true;
                }
                
                if ($should_remove) {
                    $removed = true;
                    continue;
                }
                
                $updated_shows[] = $show;
            }
            
            if ($removed) {
                update_post_meta($schedule_id, 'shows', $updated_shows);
            }
            
            return rest_ensure_response(array(
                'success' => true,
                'message' => $removed ? 'Show slot removed' : 'Show slot not found',
                'schedule_id' => $schedule_id,
                'day' => $day_name,
                'removed' => $removed,
                'total_shows' => count($updated_shows),
            ));
        }
        
        return new WP_Error('invalid_mode', 'Invalid mode. Use: add, update, replace, or remove', array('status' => 400));
    }
}

// Initialize the plugin
new Clara_ProRadio_Sync();
