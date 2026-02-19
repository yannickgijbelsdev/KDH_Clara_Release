<?php
/**
 * Plugin Name: Clara ProRadio Sync
 * Description: Allows Clara to sync show schedules to ProRadio via REST API
 * Version: 1.1.0
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
        
        register_rest_route('clara/v1', '/debug/meta/(?P<post_id>\d+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'debug_meta'),
            'permission_callback' => array($this, 'check_permission'),
        ));
    }
    
    public function check_permission($request) {
        $user = wp_get_current_user();
        if ($user->ID === 0) {
            return new WP_Error('unauthorized', 'Authentication required', array('status' => 401));
        }
        if (!current_user_can('edit_posts')) {
            return new WP_Error('forbidden', 'Insufficient permissions', array('status' => 403));
        }
        return true;
    }
    
    public function debug_meta($request) {
        $post_id = intval($request['post_id']);
        $all_meta = get_post_meta($post_id);
        
        // Also try ACF if available
        $acf_data = array();
        if (function_exists('get_fields')) {
            $acf_data = get_fields($post_id);
        }
        
        return rest_ensure_response(array(
            'post_id' => $post_id,
            'all_meta' => $all_meta,
            'acf_fields' => $acf_data,
        ));
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
    
    private function get_day_name($day) {
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
        return isset($day_map[strtolower($day)]) ? $day_map[strtolower($day)] : $day;
    }
    
    private function find_schedule_post($day_name) {
        global $wpdb;
        $schedule_id = $wpdb->get_var($wpdb->prepare(
            "SELECT ID FROM $wpdb->posts WHERE post_type = 'schedule' AND post_status = 'publish' AND LOWER(post_title) = %s",
            strtolower($day_name)
        ));
        return $schedule_id ? intval($schedule_id) : null;
    }
    
    private function get_schedule_shows($schedule_id) {
        // ProRadio stores shows in 'shows' meta key as serialized array
        // But it might also use ACF repeater format
        
        // Try standard meta first
        $shows = get_post_meta($schedule_id, 'shows', true);
        if (!empty($shows) && is_array($shows)) {
            return $shows;
        }
        
        // Try ACF repeater format (shows_X_show_id, shows_X_show_time, etc.)
        $shows = array();
        $count = intval(get_post_meta($schedule_id, 'shows', true));
        
        if ($count > 0) {
            for ($i = 0; $i < $count; $i++) {
                $show_id = get_post_meta($schedule_id, 'shows_' . $i . '_show_id', true);
                $show_time = get_post_meta($schedule_id, 'shows_' . $i . '_show_time', true);
                $show_time_end = get_post_meta($schedule_id, 'shows_' . $i . '_show_time_end', true);
                
                if ($show_id || $show_time) {
                    $shows[] = array(
                        'show_id' => is_array($show_id) ? $show_id : array($show_id),
                        'show_time' => $show_time,
                        'show_time_end' => $show_time_end,
                    );
                }
            }
        }
        
        // If still empty, try to get all meta and parse manually
        if (empty($shows)) {
            $all_meta = get_post_meta($schedule_id);
            $temp_shows = array();
            
            foreach ($all_meta as $key => $value) {
                if (preg_match('/^shows_(\d+)_(.+)$/', $key, $matches)) {
                    $index = intval($matches[1]);
                    $field = $matches[2];
                    
                    if (!isset($temp_shows[$index])) {
                        $temp_shows[$index] = array();
                    }
                    
                    $val = maybe_unserialize($value[0]);
                    $temp_shows[$index][$field] = $val;
                }
            }
            
            ksort($temp_shows);
            foreach ($temp_shows as $show) {
                $show_id = isset($show['show_id']) ? $show['show_id'] : (isset($show['show']) ? $show['show'] : null);
                $shows[] = array(
                    'show_id' => is_array($show_id) ? $show_id : array($show_id),
                    'show_time' => isset($show['show_time']) ? $show['show_time'] : '',
                    'show_time_end' => isset($show['show_time_end']) ? $show['show_time_end'] : '',
                );
            }
        }
        
        return $shows;
    }
    
    private function save_schedule_shows($schedule_id, $shows) {
        // First, delete all existing show meta
        global $wpdb;
        $wpdb->query($wpdb->prepare(
            "DELETE FROM $wpdb->postmeta WHERE post_id = %d AND meta_key LIKE 'shows%%'",
            $schedule_id
        ));
        
        // Save the count
        update_post_meta($schedule_id, 'shows', count($shows));
        
        // Save each show in ACF repeater format
        foreach ($shows as $index => $show) {
            $show_id = isset($show['show_id']) ? $show['show_id'] : array();
            if (!is_array($show_id)) {
                $show_id = array($show_id);
            }
            
            update_post_meta($schedule_id, 'shows_' . $index . '_show_id', $show_id);
            update_post_meta($schedule_id, 'shows_' . $index . '_show_time', $show['show_time']);
            update_post_meta($schedule_id, 'shows_' . $index . '_show_time_end', $show['show_time_end']);
        }
        
        // Also save as serialized array for compatibility
        update_post_meta($schedule_id, '_shows_data', $shows);
        
        // Update the post modified time to trigger cache clear
        wp_update_post(array(
            'ID' => $schedule_id,
            'post_modified' => current_time('mysql'),
            'post_modified_gmt' => current_time('mysql', 1),
        ));
        
        // Clear any caches
        clean_post_cache($schedule_id);
        
        return true;
    }
    
    public function get_schedule($request) {
        $day = sanitize_text_field($request['day']);
        $day_name = $this->get_day_name($day);
        
        $schedule_id = $this->find_schedule_post($day_name);
        
        if (!$schedule_id) {
            return new WP_Error('not_found', 'Schedule not found for ' . $day_name, array('status' => 404));
        }
        
        $shows = $this->get_schedule_shows($schedule_id);
        
        return rest_ensure_response(array(
            'id' => $schedule_id,
            'day' => $day_name,
            'shows' => $shows,
        ));
    }
    
    public function update_schedule($request) {
        $params = $request->get_json_params();
        
        if (empty($params['day'])) {
            return new WP_Error('missing_day', 'Day parameter is required', array('status' => 400));
        }
        
        $day = sanitize_text_field($params['day']);
        $day_name = $this->get_day_name($day);
        $schedule_id = $this->find_schedule_post($day_name);
        
        if (!$schedule_id) {
            return new WP_Error('not_found', 'Schedule not found for ' . $day_name, array('status' => 404));
        }
        
        $mode = isset($params['mode']) ? $params['mode'] : 'add';
        $current_shows = $this->get_schedule_shows($schedule_id);
        
        if ($mode === 'replace') {
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
            
            $this->save_schedule_shows($schedule_id, $new_shows);
            
            return rest_ensure_response(array(
                'success' => true,
                'message' => 'Schedule replaced',
                'schedule_id' => $schedule_id,
                'day' => $day_name,
                'shows_count' => count($new_shows),
            ));
            
        } else if ($mode === 'add' || $mode === 'update') {
            if (!isset($params['show_id']) || !isset($params['start_time']) || !isset($params['end_time'])) {
                return new WP_Error('missing_params', 'show_id, start_time, and end_time are required', array('status' => 400));
            }
            
            $show_id = strval($params['show_id']);
            $start_time = sanitize_text_field($params['start_time']);
            $end_time = sanitize_text_field($params['end_time']);
            
            // Remove existing slot with same time
            $updated_shows = array();
            foreach ($current_shows as $show) {
                $existing_start = isset($show['show_time']) ? $show['show_time'] : '';
                $existing_end = isset($show['show_time_end']) ? $show['show_time_end'] : '';
                
                if ($existing_start === $start_time && $existing_end === $end_time) {
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
            
            $this->save_schedule_shows($schedule_id, $updated_shows);
            
            return rest_ensure_response(array(
                'success' => true,
                'message' => 'Show slot added/updated',
                'schedule_id' => $schedule_id,
                'day' => $day_name,
                'show_id' => $show_id,
                'start_time' => $start_time,
                'end_time' => $end_time,
                'total_shows' => count($updated_shows),
            ));
            
        } else if ($mode === 'remove') {
            $start_time = isset($params['start_time']) ? sanitize_text_field($params['start_time']) : null;
            $end_time = isset($params['end_time']) ? sanitize_text_field($params['end_time']) : null;
            $show_id = isset($params['show_id']) ? strval($params['show_id']) : null;
            
            $updated_shows = array();
            $removed = false;
            
            foreach ($current_shows as $show) {
                $existing_start = isset($show['show_time']) ? $show['show_time'] : '';
                $existing_end = isset($show['show_time_end']) ? $show['show_time_end'] : '';
                $existing_ids = isset($show['show_id']) ? (is_array($show['show_id']) ? $show['show_id'] : array($show['show_id'])) : array();
                
                $should_remove = false;
                
                if ($start_time && $end_time && $existing_start === $start_time && $existing_end === $end_time) {
                    $should_remove = true;
                } else if ($show_id && in_array($show_id, $existing_ids) && (!$start_time || $existing_start === $start_time)) {
                    $should_remove = true;
                }
                
                if ($should_remove) {
                    $removed = true;
                    continue;
                }
                
                $updated_shows[] = $show;
            }
            
            if ($removed) {
                $this->save_schedule_shows($schedule_id, $updated_shows);
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

new Clara_ProRadio_Sync();
